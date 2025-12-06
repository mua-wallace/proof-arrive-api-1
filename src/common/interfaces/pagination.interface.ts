export interface PaginateQuery {
  page?: number;
  limit?: number;
  sortBy?: [string, 'ASC' | 'DESC'][];
  search?: string;
  searchBy?: string[];
}

export interface PaginateResult<T> {
  data: T[];
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
    sortBy: [string, 'ASC' | 'DESC'][];
    search?: string;
    searchBy?: string[];
  };
  links: {
    first?: string;
    previous?: string;
    current: string;
    next?: string;
    last?: string;
  };
}

