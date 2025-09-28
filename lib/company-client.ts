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

export async function getCompany(id: string): Promise<Company> {
    const res = await fetch("/api/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok || !json?.company) {
        throw new Error(json?.error ?? `Company fetch failed for ${id}`);
    }
    return json.company as Company;
}
