import { config } from "../server/config.js";
import { createVercelHandler } from "../server/vercelApp.js";

export default createVercelHandler(config);
