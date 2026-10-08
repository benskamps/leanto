# Vendored runtime

leanto loads nothing from a CDN. These files are served from the same origin so the
page runs under a strict Content-Security-Policy (`script-src 'self'`), as it does on
brokenbranch.dev/leanto/, and so a CDN outage can't stop it booting.

| File | Source | Changes |
|---|---|---|
| `three/three.module.min.js` | npm `three@0.161.0`, `build/three.module.min.js` | none |
| `three/addons/controls/OrbitControls.js` | npm `three@0.161.0`, `examples/jsm/controls/OrbitControls.js` | `from 'three'` → `from '../../three.module.min.js'` |
| `three/addons/geometries/RoundedBoxGeometry.js` | npm `three@0.161.0`, `examples/jsm/geometries/RoundedBoxGeometry.js` | same import rewrite |
| `rapier/rapier.es.js` | npm `@dimforge/rapier3d-compat@0.14.0`, `rapier.es.js` (WASM inlined as base64) | none |

Licences: `three/LICENSE` (MIT), `rapier/LICENSE` (Apache-2.0).

Imports are relative paths rather than an import map because an inline
`<script type="importmap">` is itself an inline script that `script-src 'self'` blocks.
Every module must import three through `vendor/three/three.module.min.js` so there is
exactly one copy of three in the page.

**CSP note:** Rapier compiles its WebAssembly at startup, so a host that enforces CSP
needs `'wasm-unsafe-eval'` in `script-src` (it allows WASM compilation only, not JS
`eval`).

## Integrity

ES module imports can't carry `integrity=` attributes, so the pins live here. Verify
from the repo root:

```bash
cd src/vendor && for f in three/three.module.min.js three/addons/controls/OrbitControls.js \
  three/addons/geometries/RoundedBoxGeometry.js rapier/rapier.es.js; do
  echo "$f sha384-$(openssl dgst -sha384 -binary "$f" | base64)"; done
```

```
three/three.module.min.js sha384-NKwB8sp2fZuqIEwge6UnAPbF+IlD950MxlARvyNhNXc/eMvBtfOKg8MASoHligwZ
three/addons/controls/OrbitControls.js sha384-YEdWok94L1sjZnHkwo+DXKq/M6cyhvoDy5nLiCfUnWA0o3uC5dtTtOjpIBlAD/np
three/addons/geometries/RoundedBoxGeometry.js sha384-wzpMDkKlkg9bnJmLN9UgFx3L8s6cPkPjpH+CP2p3OsIFzAuuvpVJmtyds32dazgc
rapier/rapier.es.js sha384-QQpLVtcYyx8phnYKt3Eo9W9/hhJU1+raYKh3dUzOmyKPS/3rWwsbf6XwcSGsPKyL
```

To upgrade: `npm pack three@X @dimforge/rapier3d-compat@Y`, copy the same files, re-apply
the addon import rewrite, update this table and the hashes.
