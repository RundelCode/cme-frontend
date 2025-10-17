'use client';

import React, { useState } from 'react';
import styles from './client.module.css';
import UpdateProfile from './component/updateCompany';

type Props = {};

export default function Client({ }: Props) {
    return (
        <div className={styles.main}>
            <div className={styles.card}>
                <UpdateProfile />
            </div>
        </div>
    );
}
