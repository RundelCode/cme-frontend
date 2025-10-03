'use client'
import React, { useState } from 'react'
import styles from './settings.module.css'
import UpdateProfile from './profile/UpdateProfile'

type Props = {}

export default function client({ }: Props) {

    const [active, setActive] = useState<number>(1)

    return (
        <div className={styles.card}>
            <div className={styles.settingNav}>
                <h2>Ajustes</h2>
                <div className={styles.options}>
                    <div className={styles.optionSection}>
                        <p>Perfil</p>
                        <button onClick={()=> setActive(1)} className={styles.option}>
                            Editar mi perfil
                        </button>
                        <button onClick={()=> setActive(2)} className={styles.option}>
                            Prueba
                        </button>
                    </div>
                </div>
            </div>
            <div className={styles.activeOption}>
                {active == 1 && (
                    <UpdateProfile></UpdateProfile>
                ) }
                {active == 2 && (
                    <div>HOLA</div>
                ) }
            </div>
        </div>
    )
}