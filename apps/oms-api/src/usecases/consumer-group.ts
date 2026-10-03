/**
 * 이 서비스가 메시지 버스를 구독하는 컨슈머 그룹이자 인박스(`processed_messages`)의 처리 기록 키.
 * 바꾸면 브로커의 읽기 위치와 멱등 기록이 모두 새로 시작되므로 바꾸지 않는다.
 */
export const CONSUMER_GROUP = 'oms-api';
