import styles from '../finance.module.css';
import Client from './client';
import Navbar from '../../../../components/navbar/navbar';


export default function FinancePage() {
    
    return (
        <div className={styles.page}>
            <Navbar />
            <Client></Client>
        </div>
    );
}
