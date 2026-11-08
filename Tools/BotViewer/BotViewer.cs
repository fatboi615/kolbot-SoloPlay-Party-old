// Bot Viewer - shows a live picture of every Diablo II window in one grid, so overlapping game windows
// don't matter. Uses Windows' own live thumbnails (the same thing Alt+Tab shows), so it costs almost nothing.
// Compiled on the fly by BotViewer.ps1 (Windows PowerShell 5.1 = C# 5, so no newer syntax in here).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class BotViewerApp
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    public static void Run(string partyDir)
    {
        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new BotViewerForm(partyDir));
    }
}

public class BotViewerForm : Form
{
    // ---- Win32 / DWM -------------------------------------------------------------------
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);

    [DllImport("dwmapi.dll")] static extern int DwmRegisterThumbnail(IntPtr dest, IntPtr src, out IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUnregisterThumbnail(IntPtr thumb);
    [DllImport("dwmapi.dll")] static extern int DwmUpdateThumbnailProperties(IntPtr thumb, ref DWM_THUMBNAIL_PROPERTIES props);
    [DllImport("dwmapi.dll")] static extern int DwmQueryThumbnailSourceSize(IntPtr thumb, out PSIZE size);

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; public RECT(int l, int t, int r, int b) { Left = l; Top = t; Right = r; Bottom = b; } }
    [StructLayout(LayoutKind.Sequential)] struct PSIZE { public int x, y; }
    [StructLayout(LayoutKind.Sequential)]
    struct DWM_THUMBNAIL_PROPERTIES
    {
        public int dwFlags;
        public RECT rcDestination;
        public RECT rcSource;
        public byte opacity;
        public bool fVisible;
        public bool fSourceClientAreaOnly;
    }
    const int DWM_TNP_RECTDESTINATION = 0x1, DWM_TNP_OPACITY = 0x4, DWM_TNP_VISIBLE = 0x8, DWM_TNP_SOURCECLIENTAREAONLY = 0x10;
    const int SW_RESTORE = 9, SW_SHOWNOACTIVATE = 4;
    static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    const uint SWP_NOSIZE = 0x1, SWP_NOACTIVATE = 0x10, SWP_ASYNCWINDOWPOS = 0x4000;

    // ---- look ---------------------------------------------------------------------------
    static readonly Color CStone = Color.FromArgb(27, 24, 19);
    static readonly Color CPanel = Color.FromArgb(36, 32, 26);
    static readonly Color CEdge = Color.FromArgb(77, 67, 53);
    static readonly Color CGold = Color.FromArgb(200, 178, 122);
    static readonly Color CText = Color.FromArgb(207, 200, 184);
    static readonly Color CDim = Color.FromArgb(140, 132, 117);
    static readonly Color CSet = Color.FromArgb(79, 191, 74);
    static readonly Color CWarn = Color.FromArgb(224, 163, 58);
    static readonly Color CLife = Color.FromArgb(179, 38, 30);
    static readonly Color CMana = Color.FromArgb(70, 70, 210);
    static readonly string[] Classes = { "Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin" };

    class Tile
    {
        public IntPtr Hwnd;
        public IntPtr Thumb;
        public string Title = "";
        public Rectangle Cell, Picture, Caption;
        public Size Source;
        public Dictionary<string, object> Info; // party file, if any
    }

    readonly string partyDir;
    readonly List<Tile> tiles = new List<Tile>();
    readonly Timer timer = new Timer();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Font nameFont, smallFont, bigFont;
    readonly CheckBox onTop = new CheckBox();
    readonly Button stack = new Button();
    const int Bar = 40, Gap = 10, CaptionH = 58;

    public BotViewerForm(string partyDir)
    {
        this.partyDir = partyDir;
        Text = "Bot Viewer";
        BackColor = CStone;
        ForeColor = CText;
        DoubleBuffered = true;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(480, 360);
        Size = new Size(1280, 860);
        KeyPreview = true;
        nameFont = new Font("Georgia", 11f, FontStyle.Bold);
        smallFont = new Font("Segoe UI", 9f);
        bigFont = new Font("Segoe UI", 11f);

        onTop.Text = "Keep on top";
        onTop.ForeColor = CText;
        onTop.AutoSize = true;
        onTop.Location = new Point(12, 10);
        onTop.CheckedChanged += delegate { TopMost = onTop.Checked; };
        Controls.Add(onTop);

        stack.Text = "Tuck game windows behind this one";
        stack.FlatStyle = FlatStyle.Flat;
        stack.FlatAppearance.BorderColor = CEdge;
        stack.BackColor = CPanel;
        stack.ForeColor = CText;
        stack.AutoSize = true;
        stack.Location = new Point(140, 6);
        stack.Click += delegate { TuckGames(); };
        Controls.Add(stack);

        timer.Interval = 1000;
        timer.Tick += delegate { Refresh_(); };
        Load += delegate { Refresh_(); timer.Start(); };
        Resize += delegate { Layout_(); Invalidate(); };
        MouseClick += OnTileClick;
        KeyDown += OnKey;
        FormClosed += delegate { foreach (Tile t in tiles) DwmUnregisterThumbnail(t.Thumb); };
    }

    // ---- find game windows --------------------------------------------------------------
    List<IntPtr> FindGames()
    {
        List<IntPtr> found = new List<IntPtr>();
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            StringBuilder sb = new StringBuilder(64);
            GetClassName(h, sb, sb.Capacity);
            string cls = sb.ToString();
            if (cls == "Diablo II") found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    static string TitleOf(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(128);
        GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    void Refresh_()
    {
        List<IntPtr> games = FindGames();
        bool changed = false;

        // drop windows that closed
        for (int i = tiles.Count - 1; i >= 0; i--)
        {
            if (!games.Contains(tiles[i].Hwnd) || !IsWindow(tiles[i].Hwnd))
            {
                DwmUnregisterThumbnail(tiles[i].Thumb);
                tiles.RemoveAt(i);
                changed = true;
            }
        }
        // add new ones
        foreach (IntPtr h in games)
        {
            bool known = false;
            foreach (Tile t in tiles) if (t.Hwnd == h) { known = true; break; }
            if (known) continue;
            IntPtr thumb;
            if (DwmRegisterThumbnail(Handle, h, out thumb) != 0) continue;
            Tile nt = new Tile();
            nt.Hwnd = h;
            nt.Thumb = thumb;
            tiles.Add(nt);
            changed = true;
        }
        foreach (Tile t in tiles)
        {
            string title = TitleOf(t.Hwnd);
            if (title != t.Title) { t.Title = title; changed = true; }
            t.Info = ReadParty(title);
            PSIZE size;
            if (DwmQueryThumbnailSourceSize(t.Thumb, out size) == 0 && (size.x != t.Source.Width || size.y != t.Source.Height))
            {
                t.Source = new Size(size.x, size.y);
                changed = true;
            }
        }
        if (changed)
        {
            tiles.Sort(delegate (Tile a, Tile b) { return string.Compare(a.Title, b.Title, StringComparison.OrdinalIgnoreCase); });
            Layout_();
        }
        Invalidate();
    }

    Dictionary<string, object> ReadParty(string profile)
    {
        if (string.IsNullOrEmpty(partyDir) || string.IsNullOrEmpty(profile)) return null;
        string path = Path.Combine(partyDir, profile.ToLowerInvariant() + ".game.json");
        try
        {
            if (!File.Exists(path)) return null;
            string text;
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (StreamReader r = new StreamReader(fs, Encoding.UTF8))
                text = r.ReadToEnd();
            Dictionary<string, object> d = json.Deserialize<Dictionary<string, object>>(text);
            double tick = Num(d, "tick");
            double now = (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
            if (now - tick > 20000) return null; // stale - not in a party game right now
            return d;
        }
        catch
        {
            return null; // caught it mid-write, next second will have it
        }
    }

    static double Num(Dictionary<string, object> d, string key)
    {
        object v;
        if (d == null || !d.TryGetValue(key, out v) || v == null) return 0;
        try { return Convert.ToDouble(v); } catch { return 0; }
    }
    static string Str(Dictionary<string, object> d, string key)
    {
        object v;
        if (d == null || !d.TryGetValue(key, out v) || v == null) return "";
        return Convert.ToString(v);
    }

    // ---- layout -------------------------------------------------------------------------
    void Layout_()
    {
        int n = tiles.Count;
        Rectangle area = new Rectangle(Gap, Bar + Gap, Math.Max(1, ClientSize.Width - Gap * 2), Math.Max(1, ClientSize.Height - Bar - Gap * 2));
        if (n == 0) return;

        // pick the column count that makes the pictures biggest
        int bestCols = 1;
        double bestScale = 0;
        for (int cols = 1; cols <= n; cols++)
        {
            int rows = (n + cols - 1) / cols;
            double cw = (area.Width - Gap * (cols - 1)) / (double)cols;
            double ch = (area.Height - Gap * (rows - 1)) / (double)rows - CaptionH;
            if (cw <= 0 || ch <= 0) continue;
            double scale = Math.Min(cw / 800.0, ch / 600.0);
            if (scale > bestScale) { bestScale = scale; bestCols = cols; }
        }
        int rowsN = (n + bestCols - 1) / bestCols;
        int cellW = (area.Width - Gap * (bestCols - 1)) / bestCols;
        int cellH = (area.Height - Gap * (rowsN - 1)) / rowsN;

        for (int i = 0; i < n; i++)
        {
            Tile t = tiles[i];
            int c = i % bestCols, r = i / bestCols;
            t.Cell = new Rectangle(area.X + c * (cellW + Gap), area.Y + r * (cellH + Gap), cellW, cellH);
            int maxW = cellW - 2, maxH = cellH - CaptionH - 2;
            double sw = t.Source.Width > 0 ? t.Source.Width : 800, sh = t.Source.Height > 0 ? t.Source.Height : 600;
            double s = Math.Max(0.05, Math.Min(maxW / sw, maxH / sh));
            int pw = (int)(sw * s), ph = (int)(sh * s);
            t.Picture = new Rectangle(t.Cell.X + (cellW - pw) / 2, t.Cell.Y + 1, pw, ph);
            t.Caption = new Rectangle(t.Cell.X, t.Picture.Bottom + 4, cellW, CaptionH - 4);

            DWM_THUMBNAIL_PROPERTIES p = new DWM_THUMBNAIL_PROPERTIES();
            p.dwFlags = DWM_TNP_RECTDESTINATION | DWM_TNP_VISIBLE | DWM_TNP_OPACITY | DWM_TNP_SOURCECLIENTAREAONLY;
            p.rcDestination = new RECT(t.Picture.Left, t.Picture.Top, t.Picture.Right, t.Picture.Bottom);
            p.opacity = 255;
            p.fVisible = true;
            p.fSourceClientAreaOnly = true;
            DwmUpdateThumbnailProperties(t.Thumb, ref p);
        }
    }

    // ---- drawing ------------------------------------------------------------------------
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        using (Pen line = new Pen(CEdge)) g.DrawLine(line, 0, Bar - 1, ClientSize.Width, Bar - 1);
        string hint = tiles.Count == 0 ? "" : "Click a game to bring it to the front.  Keys 1-" + Math.Min(9, tiles.Count) + " do the same.";
        TextRenderer.DrawText(g, hint, smallFont, new Point(ClientSize.Width - 12 - TextRenderer.MeasureText(hint, smallFont).Width, 12), CDim);

        if (tiles.Count == 0)
        {
            string msg = "No Diablo II windows found.\n\nStart your bots in D2BotNG and keep \"Show window\" on for each profile -\n" +
                         "hidden or minimized games can't be shown here. They can sit behind this window.";
            Rectangle r = new Rectangle(0, Bar, ClientSize.Width, ClientSize.Height - Bar);
            TextRenderer.DrawText(g, msg, bigFont, r, CDim, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak);
            return;
        }

        Dictionary<string, object> leader = FindLeader();
        for (int i = 0; i < tiles.Count; i++)
        {
            Tile t = tiles[i];
            using (SolidBrush b = new SolidBrush(Color.Black)) g.FillRectangle(b, t.Picture);
            using (Pen p = new Pen(CEdge)) g.DrawRectangle(p, t.Picture.X - 1, t.Picture.Y - 1, t.Picture.Width + 1, t.Picture.Height + 1);

            // the picture itself is drawn by Windows on top - only shows through when the game can't be pictured
            string state = !IsWindowVisible(t.Hwnd) ? "Hidden - turn on \"Show window\" for this profile in D2BotNG"
                         : IsIconic(t.Hwnd) ? "Minimized - click to restore" : "";
            if (state.Length > 0)
                TextRenderer.DrawText(g, state, smallFont, t.Picture, CDim, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak);

            DrawCaption(g, t, i, leader);
        }
    }

    /// the party leader's file (from whichever tile is the leader), to show who is with it
    Dictionary<string, object> FindLeader()
    {
        foreach (Tile t in tiles)
            if (t.Info != null && Str(t.Info, "role") == "leader") return t.Info;
        return null;
    }

    void DrawCaption(Graphics g, Tile t, int index, Dictionary<string, object> leader)
    {
        Rectangle c = t.Caption;
        Dictionary<string, object> d = t.Info;
        string name = d != null && Str(d, "charName").Length > 0 ? Str(d, "charName") : (t.Title.Length > 0 ? t.Title : "Diablo II");
        string key = index < 9 ? (index + 1) + "  " : "";
        TextRenderer.DrawText(g, key + name, nameFont, new Point(c.X, c.Y), CGold);

        string right = t.Title;
        if (d != null)
        {
            int cls = (int)Num(d, "cls");
            string clsName = cls >= 0 && cls < Classes.Length ? Classes[cls] : "";
            right = "Level " + (int)Num(d, "level") + " " + clsName + "  (" + t.Title + ")";
        }
        Size rs = TextRenderer.MeasureText(right, smallFont);
        TextRenderer.DrawText(g, right, smallFont, new Point(c.Right - rs.Width, c.Y + 2), CDim);

        if (d == null)
        {
            TextRenderer.DrawText(g, "No party info (not in a party game)", smallFont, new Point(c.X, c.Y + 24), CDim);
            return;
        }

        // where + what
        string where = Str(d, "areaName");
        if (where.Length == 0) where = "Area " + (int)Num(d, "area");
        string running = Str(d, "running");
        string doing = running.Length > 0 ? (running.Contains("(with leader)") ? "following the leader" : "running " + running) : "";
        string role = Str(d, "role") == "leader" ? "Leader" : "";
        bool dead = Str(d, "dead").ToLowerInvariant() == "true";
        Color whereColor = dead ? CWarn : CText;
        string line2 = (dead ? "Dead in " : "") + where + (doing.Length > 0 ? ",  " + doing : "") + (role.Length > 0 ? "  [" + role + "]" : "");
        // together with the leader?
        string near = "";
        Color nearColor = CSet;
        if (leader != null && !object.ReferenceEquals(leader, d) && Str(leader, "game") == Str(d, "game"))
        {
            double dx = Num(leader, "x") - Num(d, "x"), dy = Num(leader, "y") - Num(d, "y");
            bool sameArea = (int)Num(leader, "area") == (int)Num(d, "area");
            if (sameArea && Math.Sqrt(dx * dx + dy * dy) <= 15) near = "with the leader";
            else { near = "away from the leader"; nearColor = CWarn; }
        }
        int nearW = near.Length > 0 ? TextRenderer.MeasureText(near, smallFont).Width + 6 : 0;
        TextRenderer.DrawText(g, line2, smallFont, new Rectangle(c.X, c.Y + 22, c.Width - nearW, 18), whereColor, TextFormatFlags.EndEllipsis);
        if (nearW > 0) TextRenderer.DrawText(g, near, smallFont, new Point(c.Right - nearW + 6, c.Y + 22), nearColor);

        // life / mana bars
        int barW = Math.Max(40, (c.Width - 8) / 2);
        DrawBar(g, new Rectangle(c.X, c.Y + 42, barW, 7), Num(d, "hp"), CLife);
        DrawBar(g, new Rectangle(c.X + barW + 8, c.Y + 42, barW, 7), Num(d, "mp"), CMana);
    }

    static void DrawBar(Graphics g, Rectangle r, double pct, Color color)
    {
        pct = Math.Max(0, Math.Min(100, pct));
        using (SolidBrush back = new SolidBrush(Color.FromArgb(21, 18, 14))) g.FillRectangle(back, r);
        using (SolidBrush fill = new SolidBrush(color)) g.FillRectangle(fill, r.X, r.Y, (int)(r.Width * pct / 100.0), r.Height);
    }

    // ---- actions ------------------------------------------------------------------------
    void Focus_(Tile t)
    {
        if (IsIconic(t.Hwnd)) ShowWindow(t.Hwnd, SW_RESTORE);
        SetForegroundWindow(t.Hwnd);
    }

    void OnTileClick(object sender, MouseEventArgs e)
    {
        foreach (Tile t in tiles)
            if (t.Cell.Contains(e.Location)) { Focus_(t); return; }
    }

    void OnKey(object sender, KeyEventArgs e)
    {
        int n = -1;
        if (e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9) n = e.KeyCode - Keys.D1;
        else if (e.KeyCode >= Keys.NumPad1 && e.KeyCode <= Keys.NumPad9) n = e.KeyCode - Keys.NumPad1;
        if (n >= 0 && n < tiles.Count) Focus_(tiles[n]);
    }

    /// Move every game window to where this window is and put it at the bottom of the stack:
    /// they all sit neatly behind the viewer (still "visible", so the live pictures keep working).
    void TuckGames()
    {
        foreach (Tile t in tiles)
        {
            if (IsIconic(t.Hwnd)) ShowWindow(t.Hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(t.Hwnd, HWND_BOTTOM, Left + 20, Top + 20, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        }
        Activate();
    }
}
