# License Compatibility Report for GPLv3

## Summary

✅ **All dependencies are compatible with GPLv3** - Safe to proceed with GPLv3 license.

## Backend Dependencies (Python)

Checked with `licensecheck` tool:
- ✅ **All packages compatible**
- Main licenses: MIT, Apache 2.0, BSD (2-clause and 3-clause)
- MPL 2.0 (certifi) is compatible with GPLv3
- PSF-2.0 (typing-extensions) is compatible with GPLv3

## Frontend Dependencies (Node.js)

Checked with `license-checker` tool:
- ✅ **All dependencies compatible**
- Main licenses: MIT, ISC, Apache-2.0, BSD (2-clause and 3-clause)
- One package uses Python-2.0 (PSF-2.0): `argparse@2.0.1`
  - PSF-2.0 is compatible with GPLv3 (same as `typing-extensions` in backend)
- CC0-1.0: Compatible (public domain equivalent)
- BlueOak-1.0.0: Compatible (permissive license)

## License Breakdown

### Backend
- **MIT**: Most packages
- **Apache 2.0**: Google API packages, some utilities
- **BSD** (various): Several packages
- **MPL 2.0**: certifi (compatible)
- **PSF-2.0**: typing-extensions (compatible)

### Frontend
- **MIT**: 331 packages
- **ISC**: 31 packages
- **Apache-2.0**: 16 packages
- **BSD-2-Clause**: 12 packages
- **BSD-3-Clause**: 7 packages
- **Python-2.0 (PSF-2.0)**: 1 package (argparse - compatible)
- **CC0-1.0**: 1 package (compatible)
- **BlueOak-1.0.0**: 3 packages (compatible)

## Notes

- **PSF-2.0/Python-2.0**: Compatible with GPLv3 (confirmed by backend check showing `typing-extensions` as compatible)
- **MPL 2.0**: Compatible with GPLv3
- **CC0-1.0**: Public domain equivalent, compatible
- **BlueOak-1.0.0**: Permissive license, compatible

## Conclusion

✅ **GPLv3 is safe to use** - All dependencies are compatible.

The project has been updated with:
- Full GPLv3 license text in `LICENSE` file
- License field in `backend/pyproject.toml`
- License field in `frontend/package.json`
- Updated `README.md` to reference GPLv3

