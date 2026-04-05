import React from 'react';
import { Typography, Row, Col, Card, Statistic, List, Tag, Button } from 'antd';
import { useAuth } from '../hooks/useAuth';
import { FileTextOutlined, WarningOutlined, FileDoneOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function Dashboard() {
  const { profile } = useAuth();
  const role = profile?.role || 'constable';

  // Mock stats based on role
  const getStats = () => {
    switch (role) {
      case 'constable':
      case 'io':
        return [
          { title: 'My Open Complaints', value: 3, icon: <FileTextOutlined style={{ color: '#1890ff' }} /> },
          { title: 'Active Investigations', value: 5, icon: <SearchOutlined style={{ color: '#eb2f96' }} /> },
          { title: 'Pending HC Replies', value: 1, icon: <WarningOutlined style={{ color: '#faad14' }} /> },
        ];
      case 'sho':
      case 'supervisor':
      case 'admin':
        return [
          { title: 'Station Complaints', value: 24, icon: <FileTextOutlined style={{ color: '#1890ff' }} /> },
          { title: 'Active FIRs', value: 42, icon: <FileDoneOutlined style={{ color: '#52c41a' }} /> },
          { title: 'Pending Sign-offs', value: 8, icon: <WarningOutlined style={{ color: '#faad14' }} /> },
        ];
      default:
        return [
          { title: 'Total Tasks', value: 0, icon: <FileTextOutlined style={{ color: '#1890ff' }} /> },
        ];
    }
  };

  const getRecentActivity = () => {
    return [
      { id: 1, action: 'FIR Registered', case: 'FIR-2026-0012', time: '10 mins ago', status: 'success' },
      { id: 2, action: 'Complaint Assigned', case: 'CMP-2026-0045', time: '1 hour ago', status: 'processing' },
      { id: 3, action: 'Evidence Uploaded', case: 'FIR-2026-0010', time: '2 hours ago', status: 'default' },
    ];
  };

  return (
    <div className="dashboard-container">
      <Title level={2}>Dashboard</Title>
      <Text type="secondary">Welcome back, {profile?.full_name}</Text>
      
      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        {getStats().map((stat, idx) => (
          <Col xs={24} sm={8} key={idx}>
            <Card bordered={false}>
              <Statistic 
                title={stat.title} 
                value={stat.value} 
                prefix={stat.icon} 
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} md={12}>
          <Card title="Recent Activity" bordered={false}>
            <List
              itemLayout="horizontal"
              dataSource={getRecentActivity()}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        {item.action} 
                        <Tag color={item.status} style={{ marginLeft: 8 }}>{item.case}</Tag>
                      </span>
                    }
                    description={item.time}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Quick Actions" bordered={false}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="primary">Register Complaint</Button>
              <Button>New GD Entry</Button>
              <Button>Search Cases</Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
