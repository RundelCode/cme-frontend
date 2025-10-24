import React from 'react'
import styles from './active.module.css'
import Client from './client'
import Navbar from '../../../../components/navbar/navbar'

type Props = {}

export default function page({}: Props) {
  return (
    <div className={styles.page}>
        <Navbar></Navbar>
        <Client></Client>
    </div>
  )
}