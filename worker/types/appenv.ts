import { GlobalConfigurableSettings } from "../config";
import { AuthUser } from "./auth-types";


export type AppEnv = {
    Bindings: Env;
    Variables: {
        user: AuthUser | null;
        config: GlobalConfigurableSettings;
    }
}
