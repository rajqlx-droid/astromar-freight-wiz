## Improve cargo visibility in 2D image and 3D video

The current outputs make it hard to see how cargo is loaded:

- **3D MP4**: camera starts pointed straight down the container's centreline through the open door. Front rows occlude back rows; pallets look like tiny rectangles for half the video.
- **2D PDF row diagrams**: pure flat orthographic projections (door view, side view, top view). No depth cue, so loaders can't tell how a row sits relative to the container or how items interlock.

### What changes

**A. 3D loading video — better camera path** (`src/lib/freight/loading-video.ts`, `cameraForFrame`)

&nbsp;