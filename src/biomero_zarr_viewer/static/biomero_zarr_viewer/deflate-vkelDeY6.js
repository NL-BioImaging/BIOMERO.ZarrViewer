import { i as r } from "./pako.esm-DLNJzcmj.js";
import { B as a } from "./main-CjyjGE3X.js";
class s extends a {
  decodeBlock(e) {
    return r(new Uint8Array(e)).buffer;
  }
}
export {
  s as default
};
