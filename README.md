# jonra-social-media
## desk/ — the master list of daily posts

`desk/posts.json` is the single source for the 90 daily posts. Each post has `d` (day number), `t` (dark/light), `k` (kind), `l` (label), `c` (caption), `h` (hashtags) and `f` (image file name). Images are in `desk/img/` (`t_` files are small thumbnails). The Command Centre's Social posts tab reads from here, so edits made here show there.

`desk/carousels.json` lists every carousel: `slug`, `type`, `theme`, `caption`, `hashtags`, `check_facts` and `slides` (image files in `desk/carousels/`, in order).

`desk/illustrated.json` lists the six illustrated posts: `week`, `file` (in `desk/illustrated/`) and `caption`.
