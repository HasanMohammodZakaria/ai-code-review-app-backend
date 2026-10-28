import type { HydratedDocument } from "mongoose";
import type { IUser, IUserMethods } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<IUser, IUserMethods>;
    }
  }
}

export {};
