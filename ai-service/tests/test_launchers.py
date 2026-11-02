from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_check_launcher_has_visible_dry_run_and_pause():
    text = (ROOT / "Check EduQuest AI.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "check-ai.ps1" in text
    assert "AI_MODEL is empty" in (Path(__file__).parents[2] / "scripts" / "check-ai.ps1").read_text(encoding="utf-8")


def test_run_launcher_has_visible_dry_run_and_pause():
    text = (ROOT / "Run EduQuest.bat").read_text(encoding="utf-8")
    assert "--dry-run" in text
    assert "pause" in text.lower()
    assert "Start-EduQuest.ps1" in text
    assert 'set "ROOT=%~dp0"' in text


def test_script_file_invocation_is_safe_for_paths_with_spaces():
    root = Path(__file__).parents[2]
    start = (root / "Start-EduQuest.ps1").read_text(encoding="utf-8")
    check = (root / "scripts" / "check-ai.ps1").read_text(encoding="utf-8")
    for text in (start, check):
        assert "$args[0]" not in text
        assert "powershell -Command" not in text
        assert "Set-Location -LiteralPath" in text
    assert 'set "ROOT=%~dp0"' in (ROOT / "Run EduQuest.bat").read_text(encoding="utf-8")


def test_portable_start_dry_run_is_a_short_lived_smoke_test():
    import subprocess

    root = Path(__file__).parents[2]
    completed = subprocess.run(
        ["node", "scripts/start.mjs", "--dry-run"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
    )
    assert str(root) in completed.stdout
    assert "Would run: npm run dev" in completed.stdout
