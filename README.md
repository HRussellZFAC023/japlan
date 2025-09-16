# Japan Trip Planner

A mobile-first, offline-friendly trip planner for a late-November 2025 adventure across Japan. The tool ships as a single static page (`index.html`) and stores edits in `localStorage`, so you can tweak the plan without any backend setup.

## Features

- Responsive layout that expands from a single column on phones to multi-column day cards on larger screens.
- Sticky toolbar with friend and location filters, edit toggle, and one-click iCal export.
- Per-day cards with atomic chips for morning/afternoon/evening slots, per-chip locking, and drag-to-reorder (when Edit mode is enabled).
- Bottom sheet catalog browser grouped by Activities, Stays, and Bookings with area color accents.
- Leaflet-powered day map highlighting activities that have coordinates.
- Local storage persistence keyed at `jp-canvas6-v1` with a full prefill of the trip.

## Getting started

Open `index.html` in any modern browser (desktop or mobile). All dependencies other than [Leaflet](https://leafletjs.com/) are inlined. No build step is required.

Because the application stores state in the browser, you can reset to the default plan by clearing the `localStorage` entry or visiting with a fresh profile.
