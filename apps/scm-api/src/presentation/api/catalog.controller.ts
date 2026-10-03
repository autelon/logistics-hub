import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import {
  RegisterLocationRequest,
  RegisterProductRequest,
  UpdateLocationPolicyRequest,
  type LocationPolicy,
  type LocationPolicyChangeView,
  type LocationView,
  type ProductView,
} from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { ListLocationPolicyChangesUsecase } from '../../usecases/list-location-policy-changes.usecase.js';
import { ListLocationsUsecase } from '../../usecases/list-locations.usecase.js';
import { ListProductsUsecase } from '../../usecases/list-products.usecase.js';
import { RegisterLocationUsecase } from '../../usecases/register-location.usecase.js';
import { RegisterProductUsecase } from '../../usecases/register-product.usecase.js';
import { UpdateLocationPolicyUsecase } from '../../usecases/update-location-policy.usecase.js';

/** 기준 정보. 같은 코드로 다시 등록하면 내용을 갱신한다 (id 는 처음 것이 유지된다). */
@Controller()
export class CatalogController {
  constructor(
    private readonly registerProduct: RegisterProductUsecase,
    private readonly listProducts: ListProductsUsecase,
    private readonly registerLocation: RegisterLocationUsecase,
    private readonly listLocations: ListLocationsUsecase,
    private readonly updateLocationPolicy: UpdateLocationPolicyUsecase,
    private readonly listPolicyChanges: ListLocationPolicyChangesUsecase,
  ) {}

  @Post('products')
  product(@Body(zod(RegisterProductRequest)) body: RegisterProductRequest): Promise<ProductView> {
    return this.registerProduct.execute(body);
  }

  @Get('products')
  products(): Promise<ProductView[]> {
    return this.listProducts.execute();
  }

  @Post('locations')
  location(
    @Body(zod(RegisterLocationRequest)) body: RegisterLocationRequest,
  ): Promise<LocationView> {
    return this.registerLocation.execute(body);
  }

  @Get('locations')
  locations(): Promise<LocationView[]> {
    return this.listLocations.execute();
  }

  /** 보낸 항목만 바뀐다. 거점이 없으면 UNKNOWN_LOCATION. 바뀐 내역은 `/policy/changes`. */
  @Put('locations/:code/policy')
  policy(
    @Param('code') code: string,
    @Body(zod(UpdateLocationPolicyRequest)) body: UpdateLocationPolicyRequest,
  ): Promise<LocationPolicy> {
    return this.updateLocationPolicy.execute(code, body);
  }

  /** 최신순 50건. */
  @Get('locations/:code/policy/changes')
  policyChanges(@Param('code') code: string): Promise<LocationPolicyChangeView[]> {
    return this.listPolicyChanges.execute(code);
  }
}
