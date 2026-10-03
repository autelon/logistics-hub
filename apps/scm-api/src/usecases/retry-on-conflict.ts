/**
 * 처음 한 번을 포함한 시도 횟수. 진 쪽이 다시 하면 이긴 쪽의 커밋이 보이므로 보통 두 번째에 끝난다.
 * 같은 시리얼의 첫 보고가 아주 많이(50개) 동시에 오면 다시 하는 쪽끼리 교착이 되풀이되어 세 번으로는 모자랐다.
 */
export const MAX_ATTEMPTS = 5;

/**
 * 동시에 들어온 같은 요청에게 져서(`conflict`) 실패한 처리를 처음부터 다시 한다.
 *
 * `attempt` 는 트랜잭션을 여닫는 것까지 포함해야 한다 (`() => this.tx.run(...)`).
 * 진 트랜잭션은 롤백되어 있고 다시 하는 쪽은 새 트랜잭션이라, 그 사이에 커밋된 행이 새 스냅샷에 보인다.
 * 바깥 트랜잭션 안에서 부르면 `run` 이 합류해서 이 재시도가 소용없다. 입구의 usecase 만 쓴다.
 *
 * `conflict` 는 클래스 하나이거나 여러 개다. 여러 개를 주면 그중 하나라도 해당하는 에러에서 다시 하고, 시도 횟수는 합쳐서 센다
 * (클래스마다 이 함수를 겹쳐 부르면 시도가 곱해진다).
 *
 * `conflict` 가 아닌 에러는 그대로 던진다. 시도를 다 쓰고도 지면 마지막 에러를 던진다.
 */
type ConflictClass = abstract new (...args: never[]) => Error;

export const retryOnConflict = async <T>(
  conflict: ConflictClass | readonly ConflictClass[],
  attempt: () => Promise<T>,
): Promise<T> => {
  const conflicts = Array.isArray(conflict) ? conflict : [conflict];
  let attempts = 1;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (!conflicts.some((c) => error instanceof c) || attempts >= MAX_ATTEMPTS) throw error;
      attempts += 1;
    }
  }
};
