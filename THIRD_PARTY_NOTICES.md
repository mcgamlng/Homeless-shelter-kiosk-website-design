# Third-Party Notices

## Yuhalu Hmong Voice Pack

The optional local Hmong read-aloud feature uses recorded RPA speech samples downloaded directly
from [Yuhalu Hmong Text-To-Speech](https://yuhalu.org/).

- Author: Kong Xiong and Yuhalu contributors
- Copyright: 2018-2025+ Yuhalu
- Terms: Yuhalu states that its software may be redistributed freely for non-commercial purposes
  and that no fee may be charged for sharing or distributing it.
- Disclaimer: The voice files and software are supplied by Yuhalu as-is.

The voice archive and extracted samples are not committed to this repository, are excluded by
`.gitignore`, and are not covered by this project's MIT license. The installation script downloads
them from Yuhalu's official website for local use. Organizations should review Yuhalu's current
terms before deployment, especially for commercial use.

The Listening House project is not affiliated with or endorsed by Yuhalu.

## edge-tts

The optional walkthrough-video generator can use
[edge-tts](https://github.com/rany2/edge-tts) version 7.2.8 to create a more natural British
English narration track.

- Author: rany2 and edge-tts contributors
- License: GNU General Public License version 3
- Use in this project: optional build-time command-line tool; it is not bundled into the kiosk
  application or required when running the shelter system
- Network: narration generation requires internet access to the Microsoft Edge speech service

The generated MP4 files are committed for convenient viewing. The Python package itself is installed
separately and remains governed by its own license and service terms.
