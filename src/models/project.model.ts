import { Schema, model, type Types } from "mongoose";

export const SOURCE_TYPES = ["paste", "github"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface IProjectFile {
  path: string;
  language: string;
  content: string;
}

export interface IProject {
  owner: Types.ObjectId;
  title: string;
  description?: string;
  sourceType: SourceType;
  repoUrl?: string;
  files: IProjectFile[];
  fileCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IProjectFile>(
  {
    path: { type: String, required: true, trim: true, maxlength: 200 },
    language: { type: String, required: true, trim: true, lowercase: true },
    content: { type: String, required: true, maxlength: 100_000 },
  },
  { _id: false },
);

const projectSchema = new Schema<IProject>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    sourceType: { type: String, enum: SOURCE_TYPES, default: "paste" },
    repoUrl: { type: String, trim: true },
    files: { type: [fileSchema], default: [] },
    fileCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Keep fileCount in sync so list responses can skip the heavy `files` array
projectSchema.pre("save", function () {
  this.fileCount = this.files.length;
});

export const Project = model<IProject>("Project", projectSchema);
