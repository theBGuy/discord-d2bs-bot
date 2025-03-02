import "net";

declare module "net" {
  interface Socket {
    id?: string;
  }
}
