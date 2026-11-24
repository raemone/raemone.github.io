import { z } from "zod";

export const skills = ["Cowork", "Copilot", "Copilot Studio", "Azure Foundry"] as const;
export const participantInput = z.object({
  firstName: z.string().trim().min(1).max(850),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(100)),
  company: z.string().trim().max(100),
  role: z.string().trim().max(100),
  skills: z.array(z.enum(skills)).max(4).refine((value) => new Set(value).size === value.length, "Select each skill once."),
  profilePictureUrl: z.string().trim().max(100).refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch { return false; }
  }, "Use an HTTPS image URL without credentials."),
}).strict();
// Dataverse-assigned GUIDs do not necessarily use an RFC UUID version nibble.
export const recordId = z.guid();
export const etag = z.string().regex(/^W\/"\d+"$/, "Refresh this participant before making changes.");
export const participant = participantInput.extend({ id: recordId, etag, rawSkills: z.string() });
export type ParticipantInput = z.infer<typeof participantInput>;
export type Participant = z.infer<typeof participant>;

export const fields = {
  firstName: "cr7a7_firstname",
  lastName: "cr7a7_lastname",
  email: "cr7a7_email",
  company: "cr7a7_company",
  role: "cr7a7_role",
  skills: "cr7a7_skill",
  profilePictureUrl: "cr7a7_profilepictureurl",
} as const;
export const idColumn = "cr7a7_bootcampparticipantid";
export const entitySet = "cr7a7_bootcampparticipants";

export function parseSkills(value: string): ParticipantInput["skills"] {
  return value.split(",").map((item) => item.trim()).filter((item): item is typeof skills[number] =>
    skills.some((skill) => skill === item));
}

export function validatePictureOrigin(value: string, origins: string[]): void {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !isPictureOriginAllowed(url.origin, origins)) {
    throw new Error("The picture URL must use a configured PROFILE_PICTURE_ORIGINS origin.");
  }
}

export function isPictureOriginAllowed(origin: string, origins: string[]): boolean {
  return origins.includes("*") || origins.includes(origin);
}
