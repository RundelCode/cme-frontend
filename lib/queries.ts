
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
