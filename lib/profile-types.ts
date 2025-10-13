export type UserProfile = {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  role?: "candidate" | "company_admin" | "headhunter" | "admin" | null;
  status?: "active" | "inactive" | "banned" | "pending" | null;
  profile_picture?: string | null;
  cover_photo?: string | null;
  occupation?: string | null;
  about_me?: string | null;
  skills?: string[] | null;
  experience?: any;
  education?: any;
  cv_url?: string | null;
  reputation_score?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type ProfileSortBy = "createdAt" | "updatedAt" | "REPUTATION" | "name";
export type ProfileSortOrder = "ASC" | "DESC";

export type SearchProfilesInput = {
  q?: string;
  role?: UserProfile["role"];
  status?: UserProfile["status"];
  minReputation?: number;
  maxReputation?: number;
  skillsAny?: string[];
  skillsAll?: string[];
  sortBy?: ProfileSortBy;
  order?: ProfileSortOrder;
  limit?: number;
  offset?: number;
};
