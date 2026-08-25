import fitz
from pathlib import Path

pdf = Path("attached_assets/REACT-NATIVE-B_-_Error:_Failed_query:_select_\"id\",_\"name\",_\"cr_1787638852788.pdf")
out = Path(".agents/outputs/sentry-pdf")
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
print("pages", doc.page_count)
for number, page in enumerate(doc, 1):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    path = out / f"page-{number}.png"
    pix.save(path)
    print(path)
    print(page.get_text()[:4000])