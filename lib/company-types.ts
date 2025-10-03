export type Company = {
  id: string;
  name: string;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  companyRating?: number | null;
  boolVerified?: boolean | null;
  verifiedAt?: string | null;
  subscriptionPlan?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type CompanySortBy = 'createdAt' | 'updatedAt' | 'name' | 'RATING';
export type SortOrder = 'ASC' | 'DESC';

export type SearchCompaniesInput = {
  q?: string;
  subscriptionPlan?: 'free' | 'pro' | 'enterprise';
  boolVerified?: boolean;
  minRating?: number;
  maxRating?: number;
  industry?: string;
  location?: string;
  sortBy?: CompanySortBy;
  order?: SortOrder;
  limit?: number;
  offset?: number;
};
