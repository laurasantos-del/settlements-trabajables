from datetime import datetime

from app.document import rename_pdf


def test_rename_pdf():
    result = rename_pdf("123", "John Doe", "Capital One", datetime(2025, 5, 22))
    assert result == "LOA-123-John-Doe-Capital-One-2025.05.22.pdf"


def test_rename_pdf_spaces_stripped():
    result = rename_pdf("456", "Maria Lopez", "Sync Bank", datetime(2025, 1, 1))
    assert result == "LOA-456-Maria-Lopez-Sync-Bank-2025.01.01.pdf"
