param([int]$X,[int]$Y,[long]$ExpectedWindow)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CaptureTestInput {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
[CaptureTestInput]::SetForegroundWindow([IntPtr]$ExpectedWindow) | Out-Null
Start-Sleep -Milliseconds 100
$targetPoint = New-Object CaptureTestInput+Point
$targetPoint.X = $X
$targetPoint.Y = $Y
$underPointer = [CaptureTestInput]::GetAncestor([CaptureTestInput]::WindowFromPoint($targetPoint),2).ToInt64()
if ($underPointer -ne $ExpectedWindow) { throw ('The controlled test window is not under the pointer; refusing to click. Expected {0}; actual {1}.' -f $ExpectedWindow,$underPointer) }
$originalPoint = New-Object CaptureTestInput+Point
[CaptureTestInput]::GetCursorPos([ref]$originalPoint) | Out-Null
try {
  [CaptureTestInput]::SetCursorPos($X,$Y) | Out-Null
  [CaptureTestInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [CaptureTestInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
} finally { [CaptureTestInput]::SetCursorPos($originalPoint.X,$originalPoint.Y) | Out-Null }
