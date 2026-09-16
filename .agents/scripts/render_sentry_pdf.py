from pathlib import Path
import pymupdf

source = Path('attached_assets/REACT-NATIVE-J_-_Error:_Failed_query:_insert_into_"audit_log"__1789596789884.pdf')
output = Path(".agents/outputs/sentry-audit-error")
output.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
    pixmap.save(output / f"page-{index + 1}.png")

print(f"Rendered {document.page_count} pages to {output}")