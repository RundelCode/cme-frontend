"use client";

import { useState } from "react";
import type { Filters } from "../../hooks/useJobSearch";
import styles from "./filters.module.css";
import Image from "next/image";
import SearchIcon from "../../public/images/icons/search.png";

type Props = {
  defaultValues: Filters;
  onSubmit: (filters: Filters) => void;
};

export default function FiltersBar({ defaultValues, onSubmit }: Props) {
  const [q, setQ] = useState(defaultValues.q);
  const [projectType, setProjectType] = useState(defaultValues.projectType);
  const [paymentType, setPaymentType] = useState(defaultValues.paymentType);
  const [minSalary, setMinSalary] = useState<number | "">(defaultValues.minSalary);
  const [maxSalary, setMaxSalary] = useState<number | "">(defaultValues.maxSalary);
  const [location, setLocation] = useState(defaultValues.location);
  const [orderBy, setOrderBy] = useState(defaultValues.orderBy);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ q, projectType, paymentType, minSalary, maxSalary, location, orderBy });
  };

  return (
    <form onSubmit={handleSubmit} className={styles.filtersForm}>
      {/* Search con icono */}
      <div className={styles.searchInput}>
        <Image src={SearchIcon} alt="Search" className={styles.searchIcon} width={16} height={16} />
        <input
          type="text"
          placeholder="Search Offers..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={styles.searchField}
        />
      </div>

      <select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
        <option value="">Project type</option>
        <option value="full-time">Full-time</option>
        <option value="part-time">Part-time</option>
        <option value="contract">Contract</option>
      </select>

      <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
        <option value="">Payment type</option>
        <option value="salary">Salary</option>
        <option value="hourly">Hourly</option>
        <option value="per-project">Per project</option>
      </select>

      <input
        type="number"
        className={styles.numberSearchField}
        placeholder="Min..."
        value={minSalary}
        onChange={(e) => setMinSalary(e.target.value === "" ? "" : Number(e.target.value))}
      />
      <input
        type="number"
        className={styles.numberSearchField}
        placeholder="Max..."
        value={maxSalary}
        onChange={(e) => setMaxSalary(e.target.value === "" ? "" : Number(e.target.value))}
      />
      <input type="text" className={styles.numberSearchField} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />

      <select value={orderBy} onChange={(e) => setOrderBy(e.target.value as Filters["orderBy"])}>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="salary_desc">Salary high → low</option>
        <option value="salary_asc">Salary low → high</option>
      </select>
      <button type="submit">Search</button>
    </form>
  );
}
