export const JOB_SEARCH = /* GraphQL */ `
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
