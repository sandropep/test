import { ScrollView, StyleSheet } from 'react-native';
import { AdminAnalytics } from '../../components/AdminAnalytics';
import { ShopPerformanceLists } from '../../components/ShopPerformanceLists';

export default function AnalyticsPage() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminAnalytics />
      <ShopPerformanceLists />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 16, paddingBottom: 48 },
});
