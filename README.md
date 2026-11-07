# Eli Hayton — The Little Atlas ⛵

A small interactive portfolio. Sail between five illustrated islands to explore game projects, software and AI experiments, work experience, technical skills, and certifications.

## What's new in this version

- **Moving 3D ocean:** the water surface undulates using several overlapping waves. Sunlight and shallow-water foam change as the water moves; the ship bobs, pitches, and rolls with the same wave function. The water and ship wakes are stylized approximations rather than a full fluid-physics simulation.
- **Better backup ocean:** animated current lines, shore shallows, ship wake ripples, and wave-driven boat motion also work in the lightweight 2D map.
- **Work Harbor:** combines quality assurance at Sapphire Studios with lifeguard management at Strattonwood Swim Club and swim/lifeguard teaching experience. The island has a lifeguard chair and noticeboard alongside its lighthouse.
- **More personal style:** updated copy, a simpler 'Little Atlas' identity, and some lighter cartographic styling. Certifications remain on their own island.

## Running the website

1. Extract the ZIP archive.
2. On Windows, **double-click `START_WEBSITE.bat`**, or open a terminal in the extracted folder.
3. Run `python -m http.server 8000` and visit **http://localhost:8000** if you prefer to start it manually.

The full 3D scene uses **Three.js from a CDN** and therefore requires an internet connection. If it doesn't load, `fallback.js` will render a self-contained 2D illustrated version that can still be explored without a connection. No API keys, npm install, account, or build step is needed.

## Controls

- Click an island, its label, or its entry in the sidebar to sail there.
- Use **W/A/S/D** or the arrow keys to steer freely, or **1–5** for destinations.
- Use the **+ / −** and map buttons to adjust the view.
- Use the onscreen steering pad on touch devices.
- Open **About me** for a short intro and optional contact links.

## Edit your content

**`data.js`** holds all profile text, projects, work roles, skills, and certifications. Add a real project `url` only when it's public, and fill in the `profile` email, GitHub, LinkedIn and résumé placeholders when ready. Missing URLs intentionally don't display dead links.

**`main.js`** holds the 3D island models, water shader, shared wave formula, and sailing logic. **`fallback.js`** has the dependency-free illustration; **`styles.css`** controls typography, colors, and the panels. If you rename a destination, its island `id` can stay the same (including `qa` for Work Harbor) so no world geometry needs to change.

## Publish

Upload the extracted folder to GitHub Pages, Netlify, Cloudflare Pages, or any static web host, using the folder containing `index.html` as the root. It's still worth adding real screenshots or video of your work, GitHub links, and checking the current status of your certifications before publishing professionally.

**Technical note:** The backup layout and interaction were smoke-tested at desktop and mobile sizes. The water shader uses standard Three.js `ShaderMaterial` GLSL and is meant for a modern browser with WebGL. The online 3D scene couldn't be visually tested in the offline build environment.
