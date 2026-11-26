$inPath  = $args[0]
$outPath = $args[1]
Add-Type -AssemblyName System.IO.Compression
$targets = @{
  "xl/worksheets/sheet1.xml" = @("B23","B41","B49","B67")
  "xl/worksheets/sheet2.xml" = @("B6","B24","B32","B52","B60","B79")
}
$srcStream = [System.IO.File]::OpenRead($inPath)
$src = New-Object System.IO.Compression.ZipArchive($srcStream, [System.IO.Compression.ZipArchiveMode]::Read)
$outStream = [System.IO.File]::Create($outPath)
$dst = New-Object System.IO.Compression.ZipArchive($outStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($entry in $src.Entries) {
    $newEntry = $dst.CreateEntry($entry.FullName, [System.IO.Compression.CompressionLevel]::Optimal)
    $out = $newEntry.Open()
    if ($targets.ContainsKey($entry.FullName)) {
      $reader = New-Object System.IO.StreamReader($entry.Open())
      $text = $reader.ReadToEnd(); $reader.Close()
      foreach ($addr in $targets[$entry.FullName]) {
        $pattern = '<c r="' + $addr + '"([^>]*?)(?:\s+t="s")?([^>]*)><v>\d+</v></c>'
        $replacement = '<c r="' + $addr + '"$1$2/>'
        $newText = [regex]::Replace($text, $pattern, $replacement)
        if ($newText -eq $text) { Write-Warning "no change for $addr in $($entry.FullName)" }
        $text = $newText
      }
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
      $out.Write($bytes, 0, $bytes.Length)
    } else {
      $entry.Open().CopyTo($out)
    }
    $out.Close()
  }
} finally {
  $dst.Dispose(); $outStream.Close(); $src.Dispose(); $srcStream.Close()
}
