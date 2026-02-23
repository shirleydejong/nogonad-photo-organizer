# Nogonad Photo Organizer

Nogonad Photo Organizer is a high-performance, local-first photo viewer and organizer built with **Next.js**. It is designed to run on your local machine, allowing you to browse your photo library with the power of modern web technologies, specifically focusing on high-fidelity image rendering and metadata transparency.

**⚠️ This project is entirely build with [vibe coding](https://en.wikipedia.org/wiki/Vibe_coding): use it at your own risk.**

## 🌟 Key Features

* **HDR Rendering:** Leverages modern browser engines to display photos in High Dynamic Range (HDR), providing deeper blacks and brighter highlights compared to standard photo viewers.
* **Filmstrip Navigation:** A smooth, intuitive filmstrip interface that allows you to quickly scroll through images in a directory.
* **Detailed EXIF Viewer:** View comprehensive metadata for every highlighted photo, including camera settings, lens info, and timestamps.
* **Local-First:** Runs entirely on your PC. Your photos never leave your local environment, ensuring maximum privacy and speed.
* **Next.js Powered:** A fast, responsive UI built with the latest React patterns.

## 🚀 Getting Started

### Prerequisites

* **Node.js** (v22.x or higher recommended)
* **npm** or **yarn**

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/shirleydejong/nogonad-photo-organizer.git
cd nogonad-photo-organizer

```


2. **Install dependencies:**
```bash
npm install

```


3. **Run the development server:**
```bash
npm run dev

```

3.1. **Run server:**
```bash
npm run build
npm run start

```


4. **Open in your browser:**
Navigate to [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000).

## 🛠 Tech Stack

* **Framework:** [Next.js](https://nextjs.org/)
* **Language:** TypeScript
* **Styling:** Tailwind CSS (optional, but recommended)
* **Metadata Parsing:** `exiftool` (needed in PATH)
* **Backend:** Node.js File System (fs) API

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.

