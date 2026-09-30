{
  description = "Development environment for Festival Cashless";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_22
              pnpm
              openssl
            ];

            shellHook = ''
              echo "Festival Cashless development shell"
              echo "Node $(node --version) · pnpm $(pnpm --version)"
            '';
          };
        });
    };
}
