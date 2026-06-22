# Integration Pulse Documentation Package

This package contains the editable source and generated PDF for the Integration Pulse operations, user, and technical administration guide.

## Contents

- `Integration_Pulse_Operations_Guide.pdf` - final searchable PDF guide.
- `source/` - modular Markdown source files.
- `assets/diagrams/` - Mermaid diagram sources.
- `assets/screenshots/` - placeholder folder for sanitized screenshots.
- `Evidence_and_Open_Items.md` - implementation evidence and validation gaps.
- `build_pdf.py` - repeatable PDF generation script.

## Regenerate the PDF

From the repository root:

```powershell
python docs\integration-pulse\build_pdf.py
```

The script reads the Markdown files in `source/` and writes:

```text
docs/integration-pulse/Integration_Pulse_Operations_Guide.pdf
```

## Screenshot policy

No fabricated screenshots are included. Placeholder text appears where real sanitized screenshots should be captured from a running Integration Pulse environment.
