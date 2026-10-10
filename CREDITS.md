# Credits and licensing

## Original project assets

No externally downloaded characters, models, HDRIs, texture packs, fonts, recordings, or music are used.

| Asset                                                                                     | Author / source                                                                                                                           | License                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Luma robot, articulated shell, face, paws, ears, tail and animation                       | LUMA contributors; [`src/player/`](src/player/)                                                                                           | MIT, [LICENSE](LICENSE)                                                                                          |
| Shelter architecture, furniture, dog houses, plants, bowls, toys, ramps, fences and fan   | LUMA contributors; [`src/world/`](src/world/)                                                                                             | MIT                                                                                                              |
| Procedural terrazzo/water materials, signage atlases, original LUMA wordmark and UI icons | LUMA contributors; [`src/world/materials.js`](src/world/materials.js), [`src/ui/`](src/ui/)                                               | MIT                                                                                                              |
| Procedural score, ambience, footsteps, servo, jump, landing, fan, water and squeak sounds | LUMA contributors; [`src/audio/synthesis.js`](src/audio/synthesis.js)                                                                     | Generated audio dedicated to [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); synthesis source MIT |
| Gameplay screenshot                                                                       | Captured from this application by LUMA contributors; [`public/assets/screenshots/gameplay.webp`](public/assets/screenshots/gameplay.webp) | MIT                                                                                                              |

All artwork is generated from original parameterized geometry, canvas drawing, shaders, or mathematical audio synthesis. No copyrighted characters or commercial brands are depicted. System font stacks use the reader's locally installed fonts; no font files are redistributed.

## Bundled third-party runtime material

| Component / asset                                                             | Author and source                                                                                                                                                    | License                                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Three.js, RoomEnvironment generator, shader chunks and post-processing addons | three.js authors; [threejs.org](https://threejs.org/), [source](https://github.com/mrdoob/three)                                                                     | [MIT](https://github.com/mrdoob/three/blob/dev/LICENSE)                                  |
| SMAA area/search lookup images and WebGL shader port bundled in Three.js      | SMAA by Jorge Jimenez, Jose I. Echevarria, Tiago Sousa and Diego Gutierrez; [SMAA v2.8](https://github.com/iryoku/smaa/releases/tag/v2.8); Three.js addon adaptation | [SMAA MIT license](https://github.com/iryoku/smaa/blob/master/LICENSE.txt), Three.js MIT |
| Rapier 3D JavaScript/WASM physics                                             | Dimforge, Sébastien Crozet and contributors; [rapier.rs](https://rapier.rs/), [source](https://github.com/dimforge/rapier.js)                                        | [Apache-2.0](https://github.com/dimforge/rapier.js/blob/master/LICENSE)                  |

SMAA lookup images are technical antialiasing data embedded in the Three.js addon, not downloaded art. RoomEnvironment generates reflection geometry at runtime rather than loading an HDR image. Rapier's original WASM bytes are extracted from its compat distribution into a hashed asset; the binary is not modified. The owned `StablePMREMGenerator` specializes a normal-incidence sampling expression in pinned Three.js 0.186.1 to its algebraically equivalent form, avoiding ANGLE precision warnings without changing the lighting model.

## Development tools

Vite, Vitest, ESLint, Prettier, Playwright and Lighthouse retain their respective upstream licenses. They are development/verification tools, not game artwork or runtime frontend frameworks. See installed package license files and `package-lock.json` for the exact dependency graph. Third-party licenses remain applicable independently of the project's MIT code license.
