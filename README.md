# jonra-social-media
## desk/ — the master list of daily posts

`desk/posts.json` is the single source for the 90 daily posts. Each post has `d` (day number), `t` (dark/light), `k` (kind), `l` (label), `c` (caption), `h` (hashtags) and `f` (image file name). Images are in `desk/img/` (`t_` files are small thumbnails). The Command Centre's Social posts tab reads from here, so edits made here show there.

`desk/carousels.json` lists every carousel: `slug`, `type`, `theme`, `caption`, `hashtags`, `check_facts` and `slides` (image files in `desk/carousels/`, in order).

`desk/illustrated.json` lists the six illustrated posts: `week`, `file` (in `desk/illustrated/`) and `caption`.

`desk/videos.json` lists the reels: `slug`, `title`, `status`, `theme`, `check_facts`, `caption`, `hashtags`, `file` (an .mp4 in `desk/videos/`) and `poster` (a still from it, same folder).

A video made from a carousel also has `carousel`, that carousel's slug. The Command Centre then shows the video at the end of the carousel's slides as well as under Videos.

### Carousel videos

`tools/carousel-videos.mjs` makes the video version of a carousel: silent, vertical 1080x1920, for Stories and Reels (add music in Instagram). It follows a script in `tools/scripts/<slug>.json`, written from what is on the slides: where to look first, which lines to read in what order, and which words turn green as they are read. `tools/lines.mjs <slug>` shows where the lines sit on each slide, for writing a script.

    node tools/carousel-videos.mjs <slug> --check    check a script
    node tools/carousel-videos.mjs <slug>            make the video and list it in videos.json
    node tools/carousel-videos.mjs --all             every carousel

It needs ffmpeg (it finds the copy inside CapCut, or set FFMPEG), Chrome for the opening and end cards, and sharp (the Command Centre's copy, or set SHARP). Nothing is uploaded or posted.
