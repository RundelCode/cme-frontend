
export const JOB_SEARCH = `
  query JobSearch($input: JobSearchInput!, $limit: Int, $offset: Int) {
    jobSearch(input: $input, limit: $limit, offset: $offset) {
      total
      items {
        id
        company_id
        title
        description
        employment_type
        location_type
        skills
        location
        salary
        currency
        created_at
        status
      }
    }
  }
`;

export const GET_COMPANY = `
  query GetCompany($id: ID!) {
    company(id: $id) {
      id
      name
      email
      website      description
      industry
      location
      profilePicture
      coverPhoto
      companyRating
      boolVerified
      verifiedAt
      subscriptionPlan
      createdAt
      updatedAt
    }
  }
`;


export const JOB_BY_ID = `
  query JobById($id: ID!) {
    jobOffer(id: $id) {
      id
      company_id
      title
      description
      employment_type
      location_type
      skills
      requirements
      location
      salary
      currency
      status
      created_at
      updated_at
    }
  }
`;


export const SEARCH_COMPANIES = `
  query SearchCompanies($input: SearchCompaniesInput) {
    searchCompanies(input: $input) {
      id
      name
      email
      website
      description
      industry
      location
      profilePicture
      coverPhoto
      companyRating
      boolVerified
      verifiedAt
      subscriptionPlan
      createdAt
      updatedAt
    }
  }
`;


export const SEARCH_PROFILES = `
  query SearchProfiles($input: SearchProfilesInput) {
    searchProfiles(input: $input) {
      id
      email
      full_name
      phone
      role
      profile_picture
      cover_photo
      occupation
      about_me
      skills
      cv_url
      experience {
        role
        company
        start
        end
        description
      }
      education {
        degree
        institution
        start
        end
        description
      }
    }
  }
`;



export const CREATE_APPLICATION = `
  mutation CreateApplication($jobOfferId: ID!, $candidateId: ID!, $notes: String) {
    createApplication(
      jobOfferId: $jobOfferId
      candidateId: $candidateId
      notes: $notes
    ) {
      id
      job_offer_id
      candidate_id
      accepted
      notes
      created_at
    }
  }
`;

export const AUTH_ME = `query { authMe { id email role } }`;

export const APPLICATIONS = `
  query Applications($jobOfferId: ID, $candidateId: ID, $limit: Int, $offset: Int) {
    applications(jobOfferId: $jobOfferId, candidateId: $candidateId, limit: $limit, offset: $offset) {
      id
      job_offer_id
      candidate_id
      accepted
      notes
      created_at
    }
  }
`;


export const PROFILE_BY_ID_MIN = `
  query ProfileById($id: ID!) {
    profile(id: $id) {
      full_name
      profile_picture
      occupation
      reputation_score
    }
  }
`;

export const SEARCH_PROFILES_MIN = `
  query SearchProfiles($input: SearchProfilesInput) {
    searchProfiles(input: $input) {
      id
      full_name
      profile_picture
      occupation
      reputation_score
    }
  }
`;

export const CREATE_REFERRAL = `
  mutation CreateReferral($headhunterId: ID!, $jobOfferId: ID!, $candidateId: ID) {
    createReferral(
      headhunterId: $headhunterId
      jobOfferId: $jobOfferId
      candidateId: $candidateId
    ) {
      id
      referral_code
    }
  }
`;


export const CREATE_COMPANY = `
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) {
      id
      name
      email
      website
      description
      industry
      location
      profilePicture
      coverPhoto
      companyRating
      boolVerified
      verifiedAt
      subscriptionPlan
      createdAt
      updatedAt
    }
  }
`;


export const GET_COMPANY_MIN = `
  query GetCompany($id: ID!) {
    company(id: $id) {
      id
      name
      profilePicture
      location
    }
  }
`;

export const REFERRALS_BY_CANDIDATE = `
  query ReferralsByCandidate($candidateId: ID!, $limit: Int, $offset: Int, $status: String) {
    referralsByCandidate(candidateId: $candidateId, limit: $limit, offset: $offset, status: $status) {
      id
      headhunter_id
      candidate_id
      job_offer_id
      referral_code
      status
      created_at
      updated_at
    }
  }
`;

export const JOB_BY_ID_MIN = `
  query JobById($id: ID!) {
    jobOffer(id: $id) {
      id
      company_id
      title
      location
      employment_type
      status
      created_at
    }
  }
`;