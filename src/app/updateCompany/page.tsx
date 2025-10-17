import React from 'react'
import Navbar from '../../../components/navbar/navbar'
import styles from './client.module.css'
import Client from './client'

type Props = {}

export default function page({ }: Props) {
  return (
    <div className={styles.page}>
      <Navbar></Navbar>
      <Client></Client>
    </div>
  )
}