import 'sequelize';

declare module 'sequelize' {
  namespace Model {
    let notFoundMessage: string;
    let duplicateMessage: string;
    let foreignKeyMessage: string;
    const notFound: Error;

    function withScope(name: string, ...args: unknown[]): typeof Model;

    function paginateByOffset(
      query?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{
      links: Record<string, unknown>;
      meta: Record<string, unknown>;
      items: unknown[];
    }>;

    function findOffsetPage(
      offset: number,
      limit: number,
      options?: Record<string, unknown>,
    ): Promise<{rows: unknown[]; count: number}>;

    function findAllLocked(
      options: Record<string, unknown>,
      transaction: import('sequelize').Transaction,
    ): Promise<unknown[]>;

    function findOneLocked(
      options: Record<string, unknown>,
      transaction: import('sequelize').Transaction,
    ): Promise<unknown>;

    function findOneAndUpdate(
      findOptions?: Record<string, unknown>,
      updateValues?: Record<string, unknown>,
      useTransaction?: boolean,
    ): Promise<unknown>;
  }
}
