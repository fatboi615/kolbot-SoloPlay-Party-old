// Arrange Bots - lines every Diablo II window up in a grid that fits the screen, and keeps it that way.
// Compiled on the fly by ArrangeBots.ps1 (Windows PowerShell 5.1 = C# 5, so no newer syntax in here).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class BotArranger
{
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(int action, int param, ref RECT r, int winIni);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    const int SW_SHOWNOACTIVATE = 4, SPI_GETWORKAREA = 0x30;
    const uint SWP_NOSIZE = 0x1, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_ASYNCWINDOWPOS = 0x4000;

    public class Game
    {
        public IntPtr Hwnd;
        public string Title = "";
        public int Width, Height;            // whole window, frame included
        public int ClientWidth, ClientHeight; // what the game draws (800x600 or 640x480)
    }

    static bool dpiSet;

    /// physical pixels everywhere (otherwise display scaling makes the numbers lie)
    public static void Init()
    {
        if (dpiSet) return;
        try { SetProcessDPIAware(); } catch { }
        dpiSet = true;
    }

    public static RECT WorkArea()
    {
        Init();
        RECT r = new RECT();
        SystemParametersInfo(SPI_GETWORKAREA, 0, ref r, 0);
        return r;
    }

    public static List<Game> FindGames()
    {
        Init();
        List<Game> games = new List<Game>();
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            StringBuilder cls = new StringBuilder(64);
            GetClassName(h, cls, cls.Capacity);
            if (cls.ToString() != "Diablo II") return true;
            StringBuilder title = new StringBuilder(128);
            GetWindowText(h, title, title.Capacity);
            Game g = new Game();
            g.Hwnd = h;
            g.Title = title.ToString();
            games.Add(g);
            return true;
        }, IntPtr.Zero);
        games.Sort(delegate (Game a, Game b) { return string.Compare(a.Title, b.Title, StringComparison.OrdinalIgnoreCase); });
        return games;
    }

    static void Measure(Game g)
    {
        RECT w, c;
        GetWindowRect(g.Hwnd, out w);
        GetClientRect(g.Hwnd, out c);
        g.Width = w.Right - w.Left;
        g.Height = w.Bottom - w.Top;
        g.ClientWidth = c.Right - c.Left;
        g.ClientHeight = c.Bottom - c.Top;
    }

    /// <summary>
    /// Where each window goes. Windows may overlap only by their thin side frames; if there are more
    /// rows than fit, the rows are spread evenly so every title bar stays visible.
    /// Pure arithmetic so it can be checked without any windows.
    /// </summary>
    public static int[][] Slots(int count, int winW, int winH, int frame, int areaX, int areaY, int areaW, int areaH)
    {
        int[][] slots = new int[count][];
        if (count == 0) return slots;
        int stepX = Math.Max(1, winW - 2 * frame); // neighbours share their frames
        int cols = Math.Max(1, Math.Min(count, (areaW + 2 * frame - winW) / stepX + 1));
        int rows = (count + cols - 1) / cols;
        int stepY = winH - frame;
        if (rows > 1 && (rows - 1) * stepY + winH > areaH)
            stepY = Math.Max(40, (areaH - winH) / (rows - 1)); // doesn't fit: spread rows, title bars stay visible
        for (int i = 0; i < count; i++)
        {
            int c = i % cols, r = i / cols;
            slots[i] = new int[] { areaX - frame + c * stepX, areaY + r * stepY };
        }
        return slots;
    }

    /// <summary>Show and line up every game window. Returns a one-line report per window.</summary>
    public static List<string> Arrange(bool showHidden)
    {
        List<string> report = new List<string>();
        List<Game> games = FindGames();
        if (games.Count == 0) return report;

        foreach (Game g in games)
        {
            if (showHidden && (!IsWindowVisible(g.Hwnd) || IsIconic(g.Hwnd))) ShowWindow(g.Hwnd, SW_SHOWNOACTIVATE);
            Measure(g);
        }

        // size the grid by the biggest window (they should all be the same)
        int winW = 0, winH = 0, frame = 0;
        foreach (Game g in games)
        {
            winW = Math.Max(winW, g.Width);
            winH = Math.Max(winH, g.Height);
            frame = Math.Max(frame, Math.Max(0, (g.Width - g.ClientWidth) / 2));
        }

        RECT area = WorkArea();
        int[][] slots = Slots(games.Count, winW, winH, frame, area.Left, area.Top, area.Right - area.Left, area.Bottom - area.Top);
        for (int i = 0; i < games.Count; i++)
        {
            Game g = games[i];
            SetWindowPos(g.Hwnd, IntPtr.Zero, slots[i][0], slots[i][1], 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
            report.Add(g.Title + "  " + g.ClientWidth + "x" + g.ClientHeight + "  at " + slots[i][0] + "," + slots[i][1]);
        }
        return report;
    }

    /// a fingerprint of the current windows - when it changes (a bot restarted), arrange again
    public static string Signature()
    {
        StringBuilder sb = new StringBuilder();
        foreach (Game g in FindGames())
        {
            Measure(g);
            sb.Append(g.Hwnd.ToInt64()).Append(':').Append(g.ClientWidth).Append(IsWindowVisible(g.Hwnd) ? 'v' : 'h').Append(IsIconic(g.Hwnd) ? 'm' : 'n').Append(';');
        }
        return sb.ToString();
    }
}
