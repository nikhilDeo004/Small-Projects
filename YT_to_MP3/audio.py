"""
Batch converts every video file in one folder into an MP3 in another folder,
keeping the same filename (just a different extension).

SETUP:
1. Run this in PowerShell to find your ffmpeg.exe full path:
   Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
2. Paste that full path into FFMPEG_PATH below.
3. Edit INPUT_FOLDER and OUTPUT_FOLDER below to your actual folders.
4. Run:  python audio.py
"""

import subprocess
from pathlib import Path

# ---------- EDIT THESE THREE LINES ----------
INPUT_FOLDER = r"D:\YT_to_MP3\Guruvar_Bhajan"   # folder with your video files
OUTPUT_FOLDER = r"D:\Audio\Guruvar_Bhajan"      # folder where MP3s will be saved (use a full path, not just "Audio")
FFMPEG_PATH = r"C:\Users\Nikhil Deo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"   # e.g. r"C:\Users\Nikhil Deo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-x.x-full_build\bin\ffmpeg.exe"
# ---------------------------------------------

VIDEO_EXTENSIONS = {".webm", ".mp4", ".mkv", ".mov", ".avi"}


def convert_all():
    input_dir = Path(INPUT_FOLDER)
    output_dir = Path(OUTPUT_FOLDER)
    output_dir.mkdir(parents=True, exist_ok=True)   # create output folder if missing

    video_files = [f for f in input_dir.iterdir() if f.suffix.lower() in VIDEO_EXTENSIONS]

    if not video_files:
        print(f"No video files found in {input_dir}")
        return

    print(f"Found {len(video_files)} video file(s). Starting conversion...\n")

    success_count = 0
    for video_file in video_files:
        output_file = output_dir / f"{video_file.stem}.mp3"   # same name, .mp3 extension

        print(f"Converting: {video_file.name}")
        result = subprocess.run(
            [
                FFMPEG_PATH,
                "-y",                       # overwrite output file if it already exists
                "-i", str(video_file),      # input file
                "-vn",                      # no video, audio only
                "-acodec", "libmp3lame",
                "-q:a", "2",                # quality: 0 (best) to 9 (worst), 2 is very good
                str(output_file),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            print(f"  -> Saved: {output_file.name}\n")
            success_count += 1
        else:
            print(f"  -> FAILED: {video_file.name}")
            print(f"     Error: {result.stderr.strip()[-300:]}\n")   # last part of ffmpeg's error

    print(f"Done. {success_count}/{len(video_files)} converted successfully.")


if __name__ == "__main__":
    convert_all()