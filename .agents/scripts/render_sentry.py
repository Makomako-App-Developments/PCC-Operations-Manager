from pathlib import Path
import sys

import fitz


pdf_path = Path("attached_assets/REACT-NATIVE-A_-_Error:_6000ms_timeout_exceeded_1787623387660.pdf")
output_dir = Path(".agents/outputs/sentry-timeout")
output_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"pages={doc.page_count}")
print(f"metadata={doc.metadata}")

for index, page in enumerate(doc):
    print(f"\n--- page {index + 1} text ---")
    print(page.get_text())
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output = output_dir / f"page-{index + 1}.png"
    pix.save(output)
    print(f"rendered={output}")