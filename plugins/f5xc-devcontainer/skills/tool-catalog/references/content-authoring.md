# Content Authoring Tools

Tools for document conversion, presentations, image processing, media handling, and web content generation.

## Document Conversion

## markitdown

- **Package**: `pip install markitdown` / `npm install markitdown`
- **Purpose**: Convert documents (docx, PDF, pptx, HTML, xlsx, images) to Markdown
- **Use when**: You need to extract text content from office documents or PDFs into Markdown format
- **Quick start**:
  - `markitdown document.docx > output.md`
  - `markitdown presentation.pptx > slides.md`
  - `markitdown webpage.html > page.md`
- **Auth**: None
- **Docs**: `markitdown --help` or <https://github.com/microsoft/markitdown>

## poppler-utils

- **Package**: `apt install poppler-utils` (provides pdftotext, pdfinfo, pdftoppm)
- **Purpose**: PDF text extraction, metadata inspection, and page-to-image conversion
- **Use when**: You need to extract raw text from PDFs, check PDF metadata, or render PDF pages as images
- **Quick start**:
  - `pdftotext input.pdf output.txt`
  - `pdfinfo input.pdf`
  - `pdftoppm -png input.pdf output-prefix`
- **Auth**: None
- **Docs**: `man pdftotext` / `man pdfinfo` / `man pdftoppm`

## pdfjs-dist

- **Package**: `npm install pdfjs-dist`
- **Purpose**: PDF.js rendering library for parsing and rendering PDFs in Node.js or the browser
- **Use when**: You need programmatic PDF rendering, text extraction, or in-browser PDF display
- **Quick start**:
  - `const pdfjsLib = require('pdfjs-dist'); const doc = await pdfjsLib.getDocument('file.pdf').promise;`
  - `const page = await doc.getPage(1); const text = await page.getTextContent();`
- **Auth**: None
- **Docs**: <https://mozilla.github.io/pdf.js/>

## Presentations

## pptxgenjs

- **Package**: `npm install pptxgenjs`
- **Purpose**: Generate PowerPoint PPTX files programmatically from Node.js
- **Use when**: You need to create slide decks with text, images, charts, and tables from code
- **Quick start**:
  - `const pptx = new PptxGenJS(); const slide = pptx.addSlide(); slide.addText('Hello', { x: 1, y: 1 }); pptx.writeFile('output.pptx');`
  - `slide.addImage({ path: 'logo.png', x: 0.5, y: 0.5, w: 2, h: 2 });`
- **Auth**: None
- **Docs**: <https://gitbrent.github.io/PptxGenJS/>

## python-pptx

- **Package**: `pip install python-pptx`
- **Purpose**: Read and write PowerPoint PPTX files in Python
- **Use when**: You need to create, modify, or extract content from PowerPoint presentations using Python
- **Quick start**:
  - `from pptx import Presentation; prs = Presentation(); slide = prs.slides.add_slide(prs.slide_layouts[0])`
  - `slide.shapes.title.text = 'My Title'; prs.save('output.pptx')`
  - `prs = Presentation('existing.pptx'); for slide in prs.slides: print(slide.shapes.title.text)`
- **Auth**: None
- **Docs**: <https://python-pptx.readthedocs.io/>

## Image Processing

## imagemagick

- **Package**: `apt install imagemagick` (provides convert, identify, mogrify)
- **Purpose**: Image conversion, resizing, compositing, format transformation, and batch processing
- **Use when**: You need to resize, crop, convert formats, add watermarks, or batch-process images
- **Quick start**:
  - `convert input.png -resize 800x600 output.jpg`
  - `identify image.png`
  - `mogrify -format webp -quality 80 *.png`
- **Auth**: None
- **Docs**: `man convert` / `man identify` or <https://imagemagick.org/>

## sharp

- **Package**: `npm install sharp`
- **Purpose**: High-performance Node.js image processing (resize, crop, format conversion, compositing)
- **Use when**: You need fast server-side image processing in Node.js with low memory usage
- **Quick start**:
  - `await sharp('input.jpg').resize(800, 600).toFile('output.webp');`
  - `await sharp('input.png').rotate(90).grayscale().toBuffer();`
  - `const metadata = await sharp('image.jpg').metadata();`
- **Auth**: None
- **Docs**: <https://sharp.pixelplumbing.com/>

## @napi-rs/canvas

- **Package**: `npm install @napi-rs/canvas`
- **Purpose**: Canvas 2D rendering API for Node.js (drop-in replacement for node-canvas)
- **Use when**: You need to draw graphics, generate images from scratch, or render text onto images in Node.js
- **Quick start**:
  - `const { createCanvas } = require('@napi-rs/canvas'); const canvas = createCanvas(800, 600);`
  - `const ctx = canvas.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 800, 600);`
  - `const buffer = canvas.toBuffer('image/png'); fs.writeFileSync('output.png', buffer);`
- **Auth**: None
- **Docs**: <https://github.com/aspect-build/aspect-workflows>

## graphviz

- **Package**: `apt install graphviz` (provides dot, neato, fdp)
- **Purpose**: Generate diagrams and graphs from textual descriptions (DOT language)
- **Use when**: You need to create network diagrams, flowcharts, org charts, or dependency graphs
- **Quick start**:
  - `echo 'digraph { A -> B -> C }' | dot -Tpng -o graph.png`
  - `dot -Tsvg input.dot -o output.svg`
  - `neato -Tpng -Goverlap=false graph.dot -o output.png`
- **Auth**: None
- **Docs**: `man dot` or <https://graphviz.org/documentation/>

## qrencode

- **Package**: `apt install qrencode`
- **Purpose**: Generate QR codes from text, URLs, or data
- **Use when**: You need to create QR codes for URLs, contact info, Wi-Fi credentials, or any text data
- **Quick start**:
  - `qrencode -o qr.png 'https://example.com'`
  - `qrencode -t SVG -o qr.svg 'Hello World'`
  - `qrencode -s 10 -l H -o qr.png 'WIFI:T:WPA;S:MyNetwork;P:password;;'`
- **Auth**: None
- **Docs**: `man qrencode`

## Media

## ffmpeg

- **Package**: `apt install ffmpeg`
- **Purpose**: Audio and video conversion, transcoding, streaming, and processing
- **Use when**: You need to convert video/audio formats, extract audio, trim clips, or create thumbnails
- **Quick start**:
  - `ffmpeg -i input.mp4 -vn -acodec mp3 output.mp3`
  - `ffmpeg -i input.mov -c:v libx264 -crf 23 output.mp4`
  - `ffmpeg -i video.mp4 -ss 00:01:00 -frames:v 1 thumbnail.png`
- **Auth**: None
- **Docs**: `man ffmpeg` or <https://ffmpeg.org/documentation.html>

## yt-dlp

- **Package**: Manual download — `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp`
- **Purpose**: Download video and audio from YouTube and hundreds of other sites
- **Use when**: You need to download videos, extract audio, or fetch video metadata from web sources
- **Quick start**:
  - `yt-dlp 'https://www.youtube.com/watch?v=VIDEO_ID'`
  - `yt-dlp -x --audio-format mp3 'https://www.youtube.com/watch?v=VIDEO_ID'`
  - `yt-dlp --print title --print duration 'URL'`
- **Auth**: None (some sites may require cookies)
- **Docs**: `yt-dlp --help` or <https://github.com/yt-dlp/yt-dlp>

## asciinema

- **Package**: `pip install asciinema`
- **Purpose**: Record terminal sessions as lightweight asciicast files for sharing and playback
- **Use when**: You need to create terminal demos, record CLI workflows, or produce documentation screencasts
- **Quick start**:
  - `asciinema rec demo.cast`
  - `asciinema play demo.cast`
  - `asciinema rec --idle-time-limit 2 --title "My Demo" demo.cast`
- **Auth**: None (optional asciinema.org account for uploads)
- **Docs**: `asciinema --help` or <https://docs.asciinema.org/>

## asciinema-player

- **Package**: `npm install asciinema-player`
- **Purpose**: Embed and play back terminal recordings in web pages
- **Use when**: You need to display recorded terminal sessions in a browser or documentation site
- **Quick start**:
  - `import * as AsciinemaPlayer from 'asciinema-player'; AsciinemaPlayer.create('demo.cast', document.getElementById('terminal'));`
  - Include CSS: `import 'asciinema-player/dist/bundle/asciinema-player.css';`
- **Auth**: None
- **Docs**: <https://docs.asciinema.org/manual/player/>

## Web Content

## html2canvas

- **Package**: `npm install html2canvas`
- **Purpose**: Render HTML elements to canvas for screenshot capture in the browser
- **Use when**: You need to capture screenshots of HTML content, generate image previews, or export DOM elements as images
- **Quick start**:
  - `const canvas = await html2canvas(document.querySelector('#capture'));`
  - `const dataUrl = canvas.toDataURL('image/png');`
  - `canvas.toBlob(blob => saveAs(blob, 'screenshot.png'));`
- **Auth**: None
- **Docs**: <https://html2canvas.hertzen.com/>

## react

- **Package**: `npm install react react-dom`
- **Purpose**: Build component-based user interfaces for web applications
- **Use when**: You need to create interactive web UIs, single-page applications, or render components server-side
- **Quick start**:
  - `import React from 'react'; import { createRoot } from 'react-dom/client';`
  - `const root = createRoot(document.getElementById('root')); root.render(<App />);`
  - `npx create-react-app my-app`
- **Auth**: None
- **Docs**: <https://react.dev/>

## react-icons

- **Package**: `npm install react-icons`
- **Purpose**: Icon library providing popular icon sets (Font Awesome, Material, Heroicons, etc.) as React components
- **Use when**: You need icons in a React application without loading full icon font files
- **Quick start**:
  - `import { FaBeer } from 'react-icons/fa'; const App = () => <FaBeer size={24} color="gold" />;`
  - `import { MdDashboard } from 'react-icons/md';`
  - `import { HiOutlineSearch } from 'react-icons/hi';`
- **Auth**: None
- **Docs**: <https://react-icons.github.io/react-icons/>
