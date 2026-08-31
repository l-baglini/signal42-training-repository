package com.solo.plan.repository;

import com.solo.plan.model.Plan;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PlanRepository extends JpaRepository<Plan, Long> {

  List<Plan> findAllByOrderByPriceAsc();
}