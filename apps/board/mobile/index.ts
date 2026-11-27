// Must stay first: the polyfills must exist before any shared module runs.
import "./src/polyfills";
import { registerRootComponent } from "expo";

import App from "./src/App";

registerRootComponent(App);
