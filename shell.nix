# Native dev toolchain for NixOS contributors: `nix-shell` (or
# `nix-shell --run 'make test'`). Other platforms install uv, Python 3.12
# and Node 22 directly — see docs/setup/GETTING_STARTED.md.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    python312
    uv
    nodejs_22
    git
    gnumake
  ];

  # Use the Nix-provided interpreter; uv's downloaded CPython builds are
  # not patched for NixOS.
  env = {
    UV_PYTHON = "${pkgs.python312}/bin/python3.12";
    UV_PYTHON_DOWNLOADS = "never";
  };

  # Prebuilt wheels (Pillow, pydantic-core, ...) link against libstdc++/zlib.
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib ];
}
