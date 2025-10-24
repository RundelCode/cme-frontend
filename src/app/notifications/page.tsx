import styles from './notifications.module.css';
import Navbar from '../../../components/navbar/navbar';
import Client from './client';


export default function FinancePage() {
    
    return (
        <div className={styles.page}>
            <Navbar />
            <Client></Client>
        </div>
    );
}
