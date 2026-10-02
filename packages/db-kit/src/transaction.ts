import { AsyncLocalStorage } from 'node:async_hooks';

/** 트랜잭션을 열고, 그 핸들을 넘겨 `work` 를 실행한 뒤 커밋(예외면 롤백)하는 함수. Drizzle 의 `db.transaction` 모양이다. */
export type TransactionOpener<TExecutor> = <T>(work: (tx: TExecutor) => Promise<T>) => Promise<T>;

/**
 * 실행 컨텍스트(`AsyncLocalStorage`)에 묶인 트랜잭션.
 * `run` 안에서 불린 코드는 인자로 받지 않아도 `current()` 로 같은 트랜잭션 핸들을 얻는다.
 * Nest 에 의존하지 않으며, 서비스에는 `@repo/nest-kit` 의 `TransactionRunner`·`CurrentDb` 포트로 노출된다.
 */
export class AmbientTransaction<TExecutor> {
  private readonly storage = new AsyncLocalStorage<TExecutor>();
  private readonly root: TExecutor;
  private readonly open: TransactionOpener<TExecutor>;

  constructor(root: TExecutor, open: TransactionOpener<TExecutor>) {
    this.root = root;
    this.open = open;
  }

  /** `run` 안이면 그 트랜잭션 핸들, 밖이면 루트 연결(쿼리마다 자동 커밋). 쓸 때마다 다시 얻고 보관하지 않는다. */
  current(): TExecutor {
    return this.storage.getStore() ?? this.root;
  }

  isActive(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * `work` 를 트랜잭션 하나로 실행한다. 정상 반환이면 커밋, 예외면 롤백.
   * 이미 `run` 안이면 새로 열지 않고 바깥 트랜잭션에 합류한다. 이때 커밋·롤백은 가장 바깥 `run` 이 정한다
   * (안쪽에서 난 예외를 바깥에서 잡아 삼키면 안쪽이 한 일도 함께 커밋된다).
   */
  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.isActive()) return work();
    return this.open((tx) => this.storage.run(tx, work));
  }
}
